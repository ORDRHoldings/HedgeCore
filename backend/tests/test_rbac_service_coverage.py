"""
tests/test_rbac_service_coverage.py

Coverage-targeted unit tests for app/services/rbac_service.py.

Uses AsyncMock DB sessions to avoid PostgreSQL dependency so tests run on
every CI run (SQLite / no DB mode).

Functions covered:
  - _normalize_role_name       — whitespace trimming, lowercasing
  - create_role                — success, IntegrityError (dedup), SQLAlchemyError
  - list_roles                 — empty, multiple roles
  - update_role                — success (returns role), not found (None), SQLAlchemyError
  - assign_role_to_user        — user not found, role not found, already assigned, success, SQLAlchemyError
  - remove_role_from_user      — role not found, no assignment, success, SQLAlchemyError
  - get_roles_by_user          — empty, non-empty
  - get_permissions_by_user    — empty, non-empty
  - get_user_hierarchy_level   — no roles (None), has roles (int)
  - get_permissions_by_role    — empty, non-empty
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.schemas.rbac import RoleCreate, RoleUpdate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db() -> AsyncMock:
    """Return a minimal AsyncMock that looks like an AsyncSession."""
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.first.return_value = None
    result.scalars.return_value.all.return_value = []
    result.scalar_one.return_value = None
    result.all.return_value = []
    db.execute.return_value = result
    db.get = AsyncMock(return_value=None)
    return db


def _make_role(role_id: int = 1, name: str = "analyst", description: str = "Analyst role") -> MagicMock:
    role = MagicMock()
    role.id = role_id
    role.name = name
    role.description = description
    role.hierarchy_level = 10
    return role


def _make_user(user_id: int = 42, email: str = "user@test.com") -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.email = email
    return user


# ===========================================================================
# _normalize_role_name
# ===========================================================================

def test_normalize_role_name_lowercases():
    """_normalize_role_name converts to lowercase."""
    from app.services.rbac_service import _normalize_role_name

    assert _normalize_role_name("ADMIN") == "admin"
    assert _normalize_role_name("Treasurer") == "treasurer"


def test_normalize_role_name_strips_whitespace():
    """_normalize_role_name strips leading/trailing whitespace."""
    from app.services.rbac_service import _normalize_role_name

    assert _normalize_role_name("  admin  ") == "admin"
    assert _normalize_role_name("\tmanager\n") == "manager"


def test_normalize_role_name_handles_mixed():
    """_normalize_role_name handles mixed case + whitespace."""
    from app.services.rbac_service import _normalize_role_name

    assert _normalize_role_name("  Chief Risk Officer  ") == "chief risk officer"


# ===========================================================================
# create_role
# ===========================================================================

@pytest.mark.asyncio
async def test_create_role_success():
    """create_role adds role, commits, refreshes, and returns the role."""
    from app.services.rbac_service import create_role

    db = _make_db()
    role_mock = _make_role(name="analyst")
    db.refresh = AsyncMock(side_effect=lambda obj: None)

    role_data = RoleCreate(name="Analyst", description="Analyst role")

    # Patch the Role constructor to return our mock
    from unittest.mock import patch
    with patch("app.services.rbac_service.Role", return_value=role_mock):
        result = await create_role(db, role_data)

    db.add.assert_called_once_with(role_mock)
    db.commit.assert_called_once()
    db.refresh.assert_called_once_with(role_mock)
    assert result is role_mock


@pytest.mark.asyncio
async def test_create_role_integrity_error_returns_existing():
    """create_role returns existing role when IntegrityError (duplicate)."""
    from app.services.rbac_service import create_role

    db = _make_db()
    existing_role = _make_role(name="analyst")
    db.commit.side_effect = IntegrityError("duplicate", {}, Exception())

    # After rollback, the second execute (select for dedup) returns existing_role
    mock_result_dedup = MagicMock()
    mock_result_dedup.scalar_one.return_value = existing_role
    db.execute.return_value = mock_result_dedup

    role_data = RoleCreate(name="ANALYST", description="Duplicate role")

    # Do NOT patch Role class — that breaks SQLAlchemy select(Role).
    # session.add() is synchronous and doesn't need patching; AsyncMock handles it.
    result = await create_role(db, role_data)

    db.rollback.assert_called_once()
    assert result is existing_role


@pytest.mark.asyncio
async def test_create_role_sqla_error_raises():
    """create_role re-raises SQLAlchemyError after rollback."""
    from unittest.mock import patch

    from app.services.rbac_service import create_role

    db = _make_db()
    db.commit.side_effect = SQLAlchemyError("connection error")

    role_data = RoleCreate(name="broken", description="Error role")

    with patch("app.services.rbac_service.Role", return_value=MagicMock()):
        with pytest.raises(SQLAlchemyError):
            await create_role(db, role_data)

    db.rollback.assert_called_once()


# ===========================================================================
# list_roles
# ===========================================================================

@pytest.mark.asyncio
async def test_list_roles_returns_empty_when_no_roles():
    """list_roles returns [] when no roles exist."""
    from app.services.rbac_service import list_roles

    db = _make_db()
    result = await list_roles(db)
    assert result == []


@pytest.mark.asyncio
async def test_list_roles_returns_all_roles():
    """list_roles returns all roles from query result."""
    from app.services.rbac_service import list_roles

    db = _make_db()
    roles = [_make_role(1, "admin"), _make_role(2, "analyst"), _make_role(3, "viewer")]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = roles
    db.execute.return_value = mock_result

    result = await list_roles(db)
    assert len(result) == 3
    assert roles[0] in result
    assert roles[2] in result


# ===========================================================================
# update_role
# ===========================================================================

@pytest.mark.asyncio
async def test_update_role_returns_updated_role():
    """update_role returns the updated Role when found."""
    from app.services.rbac_service import update_role

    db = _make_db()
    updated = _make_role(1, "analyst", "Updated description")
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = updated
    db.execute.return_value = mock_result

    update_data = RoleUpdate(description="Updated description")
    result = await update_role(db, 1, update_data)

    db.commit.assert_called_once()
    assert result is updated


@pytest.mark.asyncio
async def test_update_role_returns_none_when_not_found():
    """update_role returns None when no role matches the id."""
    from app.services.rbac_service import update_role

    db = _make_db()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    db.execute.return_value = mock_result

    update_data = RoleUpdate(description="New desc")
    result = await update_role(db, 9999, update_data)

    db.commit.assert_called_once()
    assert result is None


@pytest.mark.asyncio
async def test_update_role_raises_on_sqla_error():
    """update_role re-raises SQLAlchemyError after rollback."""
    from app.services.rbac_service import update_role

    db = _make_db()
    db.execute.side_effect = SQLAlchemyError("db error")

    update_data = RoleUpdate(description="Fail")
    with pytest.raises(SQLAlchemyError):
        await update_role(db, 1, update_data)

    db.rollback.assert_called_once()


# ===========================================================================
# assign_role_to_user
# ===========================================================================

@pytest.mark.asyncio
async def test_assign_role_user_not_found_returns_false():
    """assign_role_to_user returns False when user does not exist."""
    from app.services.rbac_service import assign_role_to_user

    db = _make_db()
    db.get = AsyncMock(return_value=None)

    result = await assign_role_to_user(db, 99, "analyst")
    assert result is False


@pytest.mark.asyncio
async def test_assign_role_role_not_found_returns_false():
    """assign_role_to_user returns False when role does not exist."""
    from app.services.rbac_service import assign_role_to_user

    db = _make_db()
    db.get = AsyncMock(return_value=_make_user(42))

    # First execute: role lookup returns None
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    db.execute.return_value = mock_result

    result = await assign_role_to_user(db, 42, "nonexistent_role")
    assert result is False


@pytest.mark.asyncio
async def test_assign_role_already_assigned_returns_true():
    """assign_role_to_user returns True when assignment already exists (idempotent)."""
    from app.services.rbac_service import assign_role_to_user

    db = _make_db()
    user = _make_user(42)
    role = _make_role(1, "analyst")
    existing_user_role = MagicMock()

    db.get = AsyncMock(return_value=user)

    call_count = 0

    async def mock_execute(stmt):
        nonlocal call_count
        call_count += 1
        mock_result = MagicMock()
        if call_count == 1:
            # Role lookup
            mock_result.scalars.return_value.first.return_value = role
        else:
            # Existing assignment check
            mock_result.scalars.return_value.first.return_value = existing_user_role
        return mock_result

    db.execute = mock_execute

    result = await assign_role_to_user(db, 42, "analyst")
    assert result is True


@pytest.mark.asyncio
async def test_assign_role_new_assignment_success():
    """assign_role_to_user creates assignment and returns True on success."""
    from app.services.rbac_service import assign_role_to_user

    db = _make_db()
    user = _make_user(42, "analyst@test.com")
    role = _make_role(1, "analyst")

    db.get = AsyncMock(return_value=user)

    call_count = 0

    async def mock_execute(stmt):
        nonlocal call_count
        call_count += 1
        mock_result = MagicMock()
        if call_count == 1:
            # Role lookup — return role
            mock_result.scalars.return_value.first.return_value = role
        else:
            # No existing assignment
            mock_result.scalars.return_value.first.return_value = None
        return mock_result

    db.execute = mock_execute

    result = await assign_role_to_user(db, 42, "analyst")
    assert result is True
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_assign_role_sqla_error_returns_false():
    """assign_role_to_user returns False on SQLAlchemyError during commit."""
    from app.services.rbac_service import assign_role_to_user

    db = _make_db()
    user = _make_user(42)
    role = _make_role(1, "analyst")

    db.get = AsyncMock(return_value=user)
    db.commit.side_effect = SQLAlchemyError("commit error")

    call_count = 0

    async def mock_execute(stmt):
        nonlocal call_count
        call_count += 1
        mock_result = MagicMock()
        if call_count == 1:
            mock_result.scalars.return_value.first.return_value = role
        else:
            mock_result.scalars.return_value.first.return_value = None
        return mock_result

    db.execute = mock_execute

    result = await assign_role_to_user(db, 42, "analyst")
    assert result is False
    db.rollback.assert_called_once()


# ===========================================================================
# remove_role_from_user
# ===========================================================================

@pytest.mark.asyncio
async def test_remove_role_role_not_found_returns_false():
    """remove_role_from_user returns False when role does not exist."""
    from app.services.rbac_service import remove_role_from_user

    db = _make_db()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    db.execute.return_value = mock_result

    result = await remove_role_from_user(db, 42, "nonexistent_role")
    assert result is False


@pytest.mark.asyncio
async def test_remove_role_no_assignment_returns_false():
    """remove_role_from_user returns False when user does not have the role."""
    from app.services.rbac_service import remove_role_from_user

    db = _make_db()
    role = _make_role(1, "analyst")

    call_count = 0

    async def mock_execute(stmt):
        nonlocal call_count
        call_count += 1
        mock_result = MagicMock()
        if call_count == 1:
            # Role lookup
            mock_result.scalars.return_value.first.return_value = role
        else:
            # DELETE returns rowcount 0
            mock_result.rowcount = 0
        return mock_result

    db.execute = mock_execute

    result = await remove_role_from_user(db, 42, "analyst")
    assert result is False


@pytest.mark.asyncio
async def test_remove_role_success_returns_true():
    """remove_role_from_user returns True when role is removed."""
    from app.services.rbac_service import remove_role_from_user

    db = _make_db()
    role = _make_role(1, "analyst")

    call_count = 0

    async def mock_execute(stmt):
        nonlocal call_count
        call_count += 1
        mock_result = MagicMock()
        if call_count == 1:
            # Role lookup
            mock_result.scalars.return_value.first.return_value = role
        else:
            # DELETE returns rowcount 1
            mock_result.rowcount = 1
        return mock_result

    db.execute = mock_execute

    result = await remove_role_from_user(db, 42, "analyst")
    assert result is True
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_remove_role_sqla_error_returns_false():
    """remove_role_from_user returns False on SQLAlchemyError."""
    from app.services.rbac_service import remove_role_from_user

    db = _make_db()
    role = _make_role(1, "analyst")

    call_count = 0

    async def mock_execute(stmt):
        nonlocal call_count
        call_count += 1
        mock_result = MagicMock()
        if call_count == 1:
            mock_result.scalars.return_value.first.return_value = role
        else:
            raise SQLAlchemyError("delete error")
        return mock_result

    db.execute = mock_execute

    result = await remove_role_from_user(db, 42, "analyst")
    assert result is False
    db.rollback.assert_called_once()


# ===========================================================================
# get_roles_by_user
# ===========================================================================

@pytest.mark.asyncio
async def test_get_roles_by_user_returns_empty_when_no_roles():
    """get_roles_by_user returns [] when user has no roles assigned."""
    from app.services.rbac_service import get_roles_by_user

    db = _make_db()
    mock_result = MagicMock()
    mock_result.all.return_value = []
    db.execute.return_value = mock_result

    result = await get_roles_by_user(db, 42)
    assert result == []


@pytest.mark.asyncio
async def test_get_roles_by_user_returns_role_names():
    """get_roles_by_user returns list of role name strings."""
    from app.services.rbac_service import get_roles_by_user

    db = _make_db()
    mock_result = MagicMock()
    # Simulates rows from (Role.name,) select
    mock_result.all.return_value = [("admin",), ("analyst",)]
    db.execute.return_value = mock_result

    result = await get_roles_by_user(db, 42)
    assert result == ["admin", "analyst"]


# ===========================================================================
# get_permissions_by_user
# ===========================================================================

@pytest.mark.asyncio
async def test_get_permissions_by_user_returns_empty_when_no_permissions():
    """get_permissions_by_user returns [] when user has no permissions."""
    from app.services.rbac_service import get_permissions_by_user

    db = _make_db()
    mock_result = MagicMock()
    mock_result.all.return_value = []
    db.execute.return_value = mock_result

    result = await get_permissions_by_user(db, 42)
    assert result == []


@pytest.mark.asyncio
async def test_get_permissions_by_user_returns_codenames():
    """get_permissions_by_user returns list of permission codename strings."""
    from app.services.rbac_service import get_permissions_by_user

    db = _make_db()
    mock_result = MagicMock()
    mock_result.all.return_value = [("hedges:read",), ("hedges:write",), ("policies:read",)]
    db.execute.return_value = mock_result

    result = await get_permissions_by_user(db, 42)
    assert result == ["hedges:read", "hedges:write", "policies:read"]


# ===========================================================================
# get_user_hierarchy_level
# ===========================================================================

@pytest.mark.asyncio
async def test_get_user_hierarchy_level_returns_none_when_no_roles():
    """get_user_hierarchy_level returns None when user has no roles."""
    from app.services.rbac_service import get_user_hierarchy_level

    db = _make_db()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    db.execute.return_value = mock_result

    result = await get_user_hierarchy_level(db, 42)
    assert result is None


@pytest.mark.asyncio
async def test_get_user_hierarchy_level_returns_minimum_level():
    """get_user_hierarchy_level returns the minimum hierarchy level across all user roles."""
    from app.services.rbac_service import get_user_hierarchy_level

    db = _make_db()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = 5  # min level
    db.execute.return_value = mock_result

    result = await get_user_hierarchy_level(db, 42)
    assert result == 5


@pytest.mark.asyncio
async def test_get_user_hierarchy_level_returns_zero_for_superuser():
    """get_user_hierarchy_level returns 0 for the highest privilege level."""
    from app.services.rbac_service import get_user_hierarchy_level

    db = _make_db()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = 0
    db.execute.return_value = mock_result

    result = await get_user_hierarchy_level(db, 1)
    assert result == 0


# ===========================================================================
# get_permissions_by_role
# ===========================================================================

@pytest.mark.asyncio
async def test_get_permissions_by_role_returns_empty_when_no_permissions():
    """get_permissions_by_role returns [] when role has no permissions."""
    from app.services.rbac_service import get_permissions_by_role

    db = _make_db()
    mock_result = MagicMock()
    mock_result.all.return_value = []
    db.execute.return_value = mock_result

    result = await get_permissions_by_role(db, 1)
    assert result == []


@pytest.mark.asyncio
async def test_get_permissions_by_role_returns_codenames():
    """get_permissions_by_role returns list of permission codename strings."""
    from app.services.rbac_service import get_permissions_by_role

    db = _make_db()
    mock_result = MagicMock()
    mock_result.all.return_value = [
        ("hedges:read",),
        ("positions:read",),
        ("reports:generate",),
    ]
    db.execute.return_value = mock_result

    result = await get_permissions_by_role(db, 1)
    assert result == ["hedges:read", "positions:read", "reports:generate"]


@pytest.mark.asyncio
async def test_get_permissions_by_role_with_different_role_ids():
    """get_permissions_by_role works for different role IDs."""
    from app.services.rbac_service import get_permissions_by_role

    db = _make_db()
    mock_result = MagicMock()
    mock_result.all.return_value = [("admin:all",)]
    db.execute.return_value = mock_result

    # Admin role (id=1) should have all permissions
    result = await get_permissions_by_role(db, 1)
    assert "admin:all" in result

    # Reset and test another role
    mock_result2 = MagicMock()
    mock_result2.all.return_value = []
    db.execute.return_value = mock_result2

    result2 = await get_permissions_by_role(db, 99)
    assert result2 == []


# ===========================================================================
# Integration-style: assign then get_roles_by_user
# ===========================================================================

@pytest.mark.asyncio
async def test_assign_then_get_roles_flow():
    """Smoke test: assign role to user, then confirm get_roles_by_user flow works."""
    from app.services.rbac_service import assign_role_to_user, get_roles_by_user

    db_assign = _make_db()
    user = _make_user(10, "cfo@company.com")
    role = _make_role(3, "treasurer")

    db_assign.get = AsyncMock(return_value=user)
    call_count = 0

    async def mock_execute_assign(stmt):
        nonlocal call_count
        call_count += 1
        mock_result = MagicMock()
        if call_count == 1:
            mock_result.scalars.return_value.first.return_value = role
        else:
            mock_result.scalars.return_value.first.return_value = None
        return mock_result

    db_assign.execute = mock_execute_assign
    assigned = await assign_role_to_user(db_assign, 10, "treasurer")
    assert assigned is True

    # Now query roles
    db_query = _make_db()
    mock_result = MagicMock()
    mock_result.all.return_value = [("treasurer",)]
    db_query.execute.return_value = mock_result

    roles = await get_roles_by_user(db_query, 10)
    assert "treasurer" in roles
