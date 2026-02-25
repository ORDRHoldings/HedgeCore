"""
app/services/auth.py

HedgeCalc - Phase V/VI
Authentication service utilities shared between JWT and API key systems.

Provides:
- get_user_by_id(): fetches user by UUID
- helper functions for login and token verification (future extension)
"""

from __future__ import annotations

import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User


# ---------------------------------------------------------------------
# ? Get User by ID
# ---------------------------------------------------------------------
async def get_user_by_id(session: AsyncSession, user_id: str | uuid.UUID) -> User | None:
    """
    Retrieve a user record by UUID primary key.

    Returns:
        User ORM instance or None if not found / invalid UUID.
    """
    try:
        user_uuid = uuid.UUID(str(user_id))
    except (ValueError, TypeError):
        return None

    result = await session.execute(select(User).where(User.id == user_uuid))
    return result.scalars().first()
