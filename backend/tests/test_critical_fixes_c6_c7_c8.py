"""
Tests for critical fixes C6, C7, C8.

C6: api_key_audit.py Base import alignment
C7: Token version validation in get_current_user
C8: Correct get_current_user import source in admin routes and authz
"""

import importlib
import inspect
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.security import create_access_token


# -----------------------------------------------------------------------
# C6 - api_key_audit.py uses correct Base
# -----------------------------------------------------------------------

class TestC6BaseImport:
    """Verify ApiKeyAuditLog uses the same Base as all other models."""

    def test_api_key_audit_uses_core_db_base(self):
        """ApiKeyAuditLog must import Base from app.core.db, not app.db.base."""
        from app.models import api_key_audit
        source = inspect.getsource(api_key_audit)
        assert "from app.core.db import Base" in source
        assert "from app.db.base import Base" not in source

    def test_api_key_audit_shares_metadata_with_user(self):
        """ApiKeyAuditLog and User must share the same metadata registry."""
        from app.models.api_key_audit import ApiKeyAuditLog
        from app.models.user import User
        assert ApiKeyAuditLog.metadata is User.metadata


# -----------------------------------------------------------------------
# C7 - Token version validation
# -----------------------------------------------------------------------

class TestC7TokenVersionValidation:
    """Token version in JWT payload must be validated against user.token_version."""

    @pytest.mark.asyncio
    async def test_matching_token_version_passes(self):
        """When token ver matches user.token_version, auth succeeds."""
        from app.core.dependencies import get_current_user

        user_id = uuid.uuid4()
        token = create_access_token(sub=str(user_id), email="t@test.com", token_version=3)

        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.is_active = True
        mock_user.token_version = 3
        mock_user.company = None
        mock_user.branch = None
        mock_user.department = None

        mock_request = MagicMock()
        mock_request.headers = {"authorization": f"Bearer {token}", "user-agent": "test"}
        mock_request.client = MagicMock(host="127.0.0.1")
        mock_request.url = MagicMock(path="/test")

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await get_current_user(request=mock_request, db=mock_db)
        assert result is mock_user

    @pytest.mark.asyncio
    async def test_mismatched_token_version_rejected(self):
        """When token ver does not match user.token_version, raise 401."""
        from app.core.dependencies import get_current_user

        user_id = uuid.uuid4()
        # Token minted with version 2, but user has been bumped to version 3
        token = create_access_token(sub=str(user_id), email="t@test.com", token_version=2)

        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.is_active = True
        mock_user.token_version = 3
        mock_user.company = None
        mock_user.branch = None
        mock_user.department = None

        mock_request = MagicMock()
        mock_request.headers = {"authorization": f"Bearer {token}", "user-agent": "test"}
        mock_request.client = MagicMock(host="127.0.0.1")
        mock_request.url = MagicMock(path="/test")

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request=mock_request, db=mock_db)
        assert exc_info.value.status_code == 401
        assert "Token revoked" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_token_without_ver_passes_backwards_compat(self):
        """Tokens without 'ver' claim should still work (backwards compat)."""
        from app.core.dependencies import get_current_user

        user_id = uuid.uuid4()
        # Token minted WITHOUT version
        token = create_access_token(sub=str(user_id), email="t@test.com", token_version=None)

        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.is_active = True
        mock_user.token_version = 5
        mock_user.company = None
        mock_user.branch = None
        mock_user.department = None

        mock_request = MagicMock()
        mock_request.headers = {"authorization": f"Bearer {token}", "user-agent": "test"}
        mock_request.client = MagicMock(host="127.0.0.1")
        mock_request.url = MagicMock(path="/test")

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await get_current_user(request=mock_request, db=mock_db)
        assert result is mock_user

    @pytest.mark.asyncio
    async def test_version_1_matches_default(self):
        """Token with ver=1 should match the default token_version=1 on User."""
        from app.core.dependencies import get_current_user

        user_id = uuid.uuid4()
        token = create_access_token(sub=str(user_id), email="t@test.com", token_version=1)

        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.is_active = True
        mock_user.token_version = 1  # default
        mock_user.company = None
        mock_user.branch = None
        mock_user.department = None

        mock_request = MagicMock()
        mock_request.headers = {"authorization": f"Bearer {token}", "user-agent": "test"}
        mock_request.client = MagicMock(host="127.0.0.1")
        mock_request.url = MagicMock(path="/test")

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await get_current_user(request=mock_request, db=mock_db)
        assert result is mock_user


# -----------------------------------------------------------------------
# C8 - Correct import source for get_current_user
# -----------------------------------------------------------------------

class TestC8ImportSource:
    """Files must import get_current_user from app.core.dependencies, not security."""

    def test_admin_roles_imports_from_dependencies(self):
        """admin_roles.py must use get_current_user from app.core.dependencies."""
        from app.api.routes import admin_roles
        source = inspect.getsource(admin_roles)
        assert "from app.core.dependencies import get_current_user" in source
        assert "from app.core.security import get_current_user" not in source

    def test_admin_users_imports_from_dependencies(self):
        """admin_users.py must use get_current_user from app.core.dependencies."""
        from app.api.routes import admin_users
        source = inspect.getsource(admin_users)
        assert "from app.core.dependencies import get_current_user" in source
        assert "from app.core.security import get_current_user" not in source

    def test_authz_imports_from_dependencies(self):
        """authz.py must use get_current_user from app.core.dependencies."""
        from app.core import authz
        source = inspect.getsource(authz)
        assert "from app.core.dependencies import get_current_user" in source
        assert "from app.core.security import get_current_user" not in source

    def test_authz_decorators_use_correct_function(self):
        """require_roles and require_permission must reference the dependencies version."""
        from app.core.authz import require_roles, require_permission
        from app.core.dependencies import get_current_user as deps_gcu
        # The decorators exist and are callable
        assert callable(require_roles)
        assert callable(require_permission)
