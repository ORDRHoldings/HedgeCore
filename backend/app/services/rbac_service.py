# app/services/rbac_service.py
"""
RBAC service layer for HedgeCalc.

Implements:
- Role management (list, create, update)
- User-role assignments
- Role lookup utilities for authorization middleware

Design:
- Fully async (SQLAlchemy 2.0 AsyncSession)
- Centralized logging and exception handling
- Reusable service functions used by admin and auth modules
- No circular imports; import models lazily when required

Security:
- Input normalization (lowercasing role names)
- Prevents duplicate assignments
- Detailed logging for all changes
"""

from __future__ import annotations

import logging
from typing import List, Optional

from sqlalchemy import select, update, delete, and_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rbac import Role, UserRole
from app.models.permission import Permission, RolePermission
from app.models.user import User
from app.schemas.rbac import RoleCreate, RoleUpdate

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------
# Helper: normalize role name
# ---------------------------------------------------------------------
def _normalize_role_name(name: str) -> str:
    """Normalize role names to lowercase ASCII."""
    return name.strip().lower()


# ---------------------------------------------------------------------
# Role Management
# ---------------------------------------------------------------------
async def create_role(session: AsyncSession, role_data: RoleCreate) -> Role:
    """Create a new role if not exists."""
    normalized = _normalize_role_name(role_data.name)
    logger.info(f"Creating role '{normalized}'")

    new_role = Role(name=normalized, description=role_data.description)
    session.add(new_role)
    try:
        await session.commit()
        await session.refresh(new_role)
        logger.info(f"Role created successfully: {new_role.name}")
        return new_role
    except IntegrityError:
        await session.rollback()
        logger.warning(f"Role '{normalized}' already exists.")
        stmt = select(Role).where(Role.name == normalized)
        result = await session.execute(stmt)
        return result.scalar_one()
    except SQLAlchemyError as e:
        await session.rollback()
        logger.exception(f"Failed to create role '{normalized}': {e}")
        raise


async def list_roles(session: AsyncSession) -> List[Role]:
    """Return all roles."""
    stmt = select(Role).order_by(Role.name)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def update_role(session: AsyncSession, role_id: int, update_data: RoleUpdate) -> Optional[Role]:
    """Update role description."""
    stmt = (
        update(Role)
        .where(Role.id == role_id)
        .values(description=update_data.description)
        .returning(Role)
    )
    try:
        result = await session.execute(stmt)
        await session.commit()
        updated_role = result.scalars().first()
        if updated_role:
            logger.info(f"Updated role {updated_role.id}: {updated_role.description}")
        return updated_role
    except SQLAlchemyError as e:
        await session.rollback()
        logger.exception(f"Failed to update role ID={role_id}: {e}")
        raise


# ---------------------------------------------------------------------
# User Role Assignment
# ---------------------------------------------------------------------
async def assign_role_to_user(session: AsyncSession, user_id: int, role_name: str) -> bool:
    """Assign a role to a user (idempotent)."""
    role_name = _normalize_role_name(role_name)
    logger.info(f"Assigning role '{role_name}' to user_id={user_id}")

    # Look up user and role
    user = await session.get(User, user_id)
    if not user:
        logger.warning(f"User ID={user_id} not found.")
        return False

    stmt_role = select(Role).where(Role.name == role_name)
    role = (await session.execute(stmt_role)).scalars().first()
    if not role:
        logger.warning(f"Role '{role_name}' not found.")
        return False

    # Check if already assigned
    stmt_existing = select(UserRole).where(
        and_(UserRole.user_id == user_id, UserRole.role_id == role.id)
    )
    existing = (await session.execute(stmt_existing)).scalars().first()
    if existing:
        logger.info(f"User {user_id} already has role '{role_name}'")
        return True

    # Create new assignment
    assignment = UserRole(user_id=user_id, role_id=role.id)
    session.add(assignment)
    try:
        await session.commit()
        logger.info(f"Assigned role '{role_name}' to user {user.email}")
        return True
    except SQLAlchemyError as e:
        await session.rollback()
        logger.exception(f"Failed to assign role '{role_name}' to user {user_id}: {e}")
        return False


async def remove_role_from_user(session: AsyncSession, user_id: int, role_name: str) -> bool:
    """Remove a role from a user."""
    role_name = _normalize_role_name(role_name)
    logger.info(f"Removing role '{role_name}' from user_id={user_id}")

    stmt_role = select(Role).where(Role.name == role_name)
    role = (await session.execute(stmt_role)).scalars().first()
    if not role:
        logger.warning(f"Role '{role_name}' not found.")
        return False

    stmt_delete = delete(UserRole).where(
        and_(UserRole.user_id == user_id, UserRole.role_id == role.id)
    )
    try:
        result = await session.execute(stmt_delete)
        await session.commit()
        if result.rowcount:
            logger.info(f"Removed role '{role_name}' from user {user_id}")
            return True
        logger.info(f"No role '{role_name}' assigned to user {user_id}")
        return False
    except SQLAlchemyError as e:
        await session.rollback()
        logger.exception(f"Error removing role '{role_name}' from user {user_id}: {e}")
        return False


async def get_roles_by_user(session: AsyncSession, user_id) -> List[str]:
    """Return a list of role names assigned to a user."""
    stmt = (
        select(Role.name)
        .join(UserRole, Role.id == UserRole.role_id)
        .where(UserRole.user_id == user_id)
        .order_by(Role.name)
    )
    result = await session.execute(stmt)
    roles = [r for (r,) in result.all()]
    logger.debug(f"User {user_id} roles: {roles}")
    return roles


# ---------------------------------------------------------------------
# Permission Queries
# ---------------------------------------------------------------------
async def get_permissions_by_user(session: AsyncSession, user_id) -> List[str]:
    """
    Return all permission codenames granted to a user via their roles.
    Joins: UserRole -> Role -> RolePermission -> Permission
    """
    stmt = (
        select(Permission.codename)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
        .distinct()
        .order_by(Permission.codename)
    )
    result = await session.execute(stmt)
    perms = [r for (r,) in result.all()]
    logger.debug(f"User {user_id} permissions: {perms}")
    return perms


async def get_user_hierarchy_level(session: AsyncSession, user_id) -> Optional[int]:
    """
    Return the lowest (most privileged) hierarchy_level across all roles
    assigned to a user. Returns None if user has no roles.
    """
    from sqlalchemy import func as sqlfunc

    stmt = (
        select(sqlfunc.min(Role.hierarchy_level))
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    result = await session.execute(stmt)
    level = result.scalars().first()
    logger.debug(f"User {user_id} hierarchy_level: {level}")
    return level


async def get_permissions_by_role(session: AsyncSession, role_id: int) -> List[str]:
    """Return all permission codenames for a given role."""
    stmt = (
        select(Permission.codename)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(RolePermission.role_id == role_id)
        .order_by(Permission.codename)
    )
    result = await session.execute(stmt)
    return [r for (r,) in result.all()]
